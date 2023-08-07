import EventEmitter from 'events';
import { LLMChain } from "langchain/chains";
import { BaseChatModel } from "langchain/chat_models/base.js";
import { VectorStoreRetriever } from "langchain/vectorstores/base.js";
import { Tool, DynamicTool } from "langchain/tools";

import { AutoGPTOutputParser } from "./output_parser";
import { AutoGPTPrompt } from "./prompt";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "langchain/schema";
// import { HumanInputRun } from "./tools/human/tool"; // TODO
import { ObjectTool, FINISH_NAME, AutoGPTReply, AutoGPTCommand } from "./schema";
import { TokenTextSplitter } from "langchain/text_splitter";

const user_input_next_step =
  "Determine which next command to use, and respond using the json format specified above:";

// getEmbeddingContextSize and getModelContextSize are not exported by langchain
// copied from langchain/src/base_language/count_tokens.ts
export const getEmbeddingContextSize = (modelName?: string): number => {
  switch (modelName) {
    case "text-embedding-ada-002":
      return 8191;
    default:
      return 2046;
  }
};

export const getModelContextSize = (modelName: string): number => {
  // original implementation uses getModelNameForTiktoken(modelName)
  switch (modelName) {
    case "gpt-3.5-turbo":
      return 4096;
    case "gpt-4-32k":
      return 32768;
    case "gpt-4":
      return 8192;
    case "text-davinci-003":
      return 4097;
    case "text-curie-001":
      return 2048;
    case "text-babbage-001":
      return 2048;
    case "text-ada-001":
      return 2048;
    case "code-davinci-002":
      return 8000;
    case "code-cushman-001":
      return 2048;
    default:
      console.warn(
        `Unknown model name: ${modelName}. Using default context size of 4097.`
      );
      return 4097;
  }
};

const HUMAN_TOOL_NAME = "request-human-input";
const humanAsTool = new DynamicTool({
  name: HUMAN_TOOL_NAME,
  description: `You can ask a human for additional input or guidance when you think you
  got stuck or you are not sure what to do next.
  The input should be a question for the human, along with necessary context.`,
  func: (_input) => new Promise((resolve) => resolve("")),
});

export interface AutoGPTStepInput {
  userMessage: string | undefined;
  assistantReply: string;
  result: string | undefined;
}

export interface AutoGPTStep extends AutoGPTStepInput {
  parsed: AutoGPTReply;
}

export interface AutoGPTInput {
  aiName: string;
  aiRole: string;
  memory: VectorStoreRetriever;
  humanInTheLoop?: boolean;
  outputParser?: AutoGPTOutputParser;
  maxIterations?: number;
}

export class AutoGPT {
  private stopSignalReceived: boolean = false;

  private pendingSteps: AutoGPTStepInput[] = [];
  private savedSteps: AutoGPTStep[] = [];

  private emitter: EventEmitter;

  aiName: string;

  memory: VectorStoreRetriever;

  fullMessageHistory: InstanceType<typeof BaseMessage>[];

  nextActionCount: number;

  chain: LLMChain;

  outputParser: AutoGPTOutputParser;

  tools: ObjectTool[];

  feedbackTool?: Tool;

  maxIterations: number;

  // Currently not generic enough to support any text splitter.
  textSplitter: TokenTextSplitter;

  abortController: AbortController;

  constructor({
    aiName,
    memory,
    chain,
    outputParser,
    tools,
    feedbackTool,
    maxIterations,
  }: Omit<Required<AutoGPTInput>, "aiRole" | "humanInTheLoop"> & {
    chain: LLMChain;
    tools: ObjectTool[];
    feedbackTool?: Tool;
  }) {
    this.aiName = aiName;
    this.memory = memory;
    this.fullMessageHistory = [];
    this.nextActionCount = 0;
    this.chain = chain;
    this.outputParser = outputParser;
    this.tools = tools;
    this.feedbackTool = feedbackTool;
    this.maxIterations = maxIterations;
    const chunkSize = getEmbeddingContextSize(
      "modelName" in memory.vectorStore.embeddings
        ? (memory.vectorStore.embeddings.modelName as string)
        : undefined
    );
    this.textSplitter = new TokenTextSplitter({
      chunkSize,
      chunkOverlap: Math.round(chunkSize / 10),
    });
    this.emitter = new EventEmitter();
    this.abortController = new AbortController();
    this.abortController.signal.addEventListener(
      "abort",
      this._onStop.bind(this)
    );
  }

  static fromLLMAndTools(
    llm: BaseChatModel,
    tools: ObjectTool[],
    {
      aiName,
      aiRole,
      memory,
      maxIterations = 100,
      // humanInTheLoop = false,
      outputParser = new AutoGPTOutputParser(),
    }: AutoGPTInput
  ): AutoGPT {
    const toolsWithHuman = [...tools, humanAsTool];
    const prompt = new AutoGPTPrompt({
      aiName,
      aiRole,
      tools: toolsWithHuman,
      tokenCounter: llm.getNumTokens.bind(llm),
      sendTokenLimit: getModelContextSize(
        "modelName" in llm ? (llm.modelName as string) : "gpt2"
      ),
    });
    // const feedbackTool = humanInTheLoop ? new HumanInputRun() : null;
    const chain = new LLMChain({ llm, prompt });
    return new AutoGPT({
      aiName,
      memory,
      chain,
      outputParser,
      tools: toolsWithHuman,
      // feedbackTool,
      maxIterations,
    });
  }

  public on(event: string, listener: (...args: any[]) => void): void {
    this.emitter.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void): void {
    this.emitter.off(event, listener);
  }

  public stop(reason: string): void {
    this.abortController.abort(reason);
  }

  // we can effectively resume agent by setting pending steps and re-running
  public setPendingSteps(steps: AutoGPTStepInput[]): void {
    this.pendingSteps = steps;
  }

  private _onStop(): void {
    this.stopSignalReceived = true;
    this.emitter.emit("stop");
    this.emitter.removeAllListeners();
    console.log('AutoGPT stopped.')
  }

  async getAssistantReply(
    goals: string[],
    user_input: string,
    step: AutoGPTStepInput | undefined
  ): Promise<string> {
    if (step != null && step.assistantReply) {
      return step.assistantReply;
    }
    const { text: assistantReply } = await this.chain.call({
      goals,
      user_input,
      memory: this.memory,
      messages: this.fullMessageHistory,
      signal: this.abortController.signal,
    });
    return assistantReply;
  }

  async getResultFromTools(
    step: AutoGPTStepInput | undefined,
    command: AutoGPTCommand,
    onRequestHumanInput: (question: string) => Promise<string | undefined>
  ): Promise<string> {
    if (step != null && step.result) {
      return step.result;
    }
    let result: string;
    const tools = this.tools.reduce(
      (acc, tool) => ({ ...acc, [tool.name]: tool }),
      {} as { [key: string]: ObjectTool }
    );
    if (command.name in tools) {
      let observation;
      const tool = tools[command.name];
      try {
        // handle human input as a special case
        if (tool === humanAsTool) {
          const humanInput = await onRequestHumanInput(command.args.input);
          // empty response or timeout
          if (!humanInput) {
            // throw "No human input received.";
            // GPT-4 would just keep ask for human input after getting the error, let's just exit here
            return "EXITING (no human input received)";
          } else if (humanInput === "stop" || humanInput === "quit") {
            console.log("EXITING");
            return "EXITING";
          } else {
            observation = humanInput;
          }
        } else {
          observation = await tool.call(command.args);
        }
      } catch (e) {
        observation = `Error: ${e}`;
      }
      result = `Command ${tool.name} returned: ${observation}`;
    } else if (command.name === "ERROR") {
      result = `Error: ${command.args}. `;
    } else {
      result = `Unknown command '${command.name}'. Please refer to the 'COMMANDS' list for available commands and only respond in the specified JSON format.`;
    }

    return result;
  }

  private updateSavedSteps(step: AutoGPTStep, fixup: boolean = false): void {
    if (fixup) {
      this.savedSteps[this.savedSteps.length - 1] = step;
    } else {
      this.savedSteps.push(step);
    }
    this.emitter.emit("update", {
      steps: this.savedSteps,
    });
  }

  async run(
    goals: string[],
    onRequestHumanInput: (question: string) => Promise<string | undefined>
  ): Promise<string | undefined> {
    let loopCount = 0;
    while (loopCount < this.maxIterations) {
      if (this.stopSignalReceived) {
        return (
          "Stopped with reason: " +
          (this.abortController.signal.reason ?? "Unknown")
        );
      }
      loopCount += 1;

      const step = this.pendingSteps.shift();
      const user_input = step?.userMessage ?? user_input_next_step;
      // use existing assistant reply if available, otherwise call the LLM chain
      const assistantReply = await this.getAssistantReply(goals, user_input, step);

      this.fullMessageHistory.push(new HumanMessage(user_input));
      this.fullMessageHistory.push(new AIMessage(assistantReply));

      const parsed = await this.outputParser.parse(
        assistantReply
      );
      this.updateSavedSteps({
        userMessage: user_input,
        assistantReply,
        parsed,
        result: undefined,
      });
      const { command } = parsed;
      if (command.name === FINISH_NAME) {
        return command.args.response;
      }
      // use existing result if available, otherwise call the tool
      const result = await this.getResultFromTools(step, command, onRequestHumanInput);
      const prevStep = this.savedSteps[this.savedSteps.length - 1];
      prevStep.result = result;
      this.updateSavedSteps(prevStep, true);

      let memoryToAdd = `Assistant Reply: ${assistantReply}\nResult: ${result} `;
      const documents = await this.textSplitter.createDocuments([memoryToAdd]);
      await this.memory.addDocuments(documents);
      this.fullMessageHistory.push(new SystemMessage(result));
    }

    return undefined;
  }
}
