import { LLMChain } from "langchain/chains";
import { BaseChatModel } from "langchain/chat_models/base.js";
import { VectorStoreRetriever } from "langchain/vectorstores/base.js";
import { Tool, DynamicTool } from "langchain/tools";

import { AutoGPTOutputParser } from "./output_parser";
import { AutoGPTPrompt } from "./prompt";
import {
  AIChatMessage,
  BaseChatMessage,
  HumanChatMessage,
  SystemChatMessage,
} from "langchain/schema";
// import { HumanInputRun } from "./tools/human/tool"; // TODO
import { ObjectTool, FINISH_NAME } from "./schema";
import { TokenTextSplitter } from "langchain/text_splitter";

const user_input_next_step =
"Determine which next command to use, and respond using the format specified above:";

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

export interface AutoGPTInput {
  aiName: string;
  aiRole: string;
  memory: VectorStoreRetriever;
  humanInTheLoop?: boolean;
  outputParser?: AutoGPTOutputParser;
  maxIterations?: number;
}

export class AutoGPT {
  private running: boolean = false;
  private paused: boolean = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;

  aiName: string;

  memory: VectorStoreRetriever;

  fullMessageHistory: BaseChatMessage[];

  nextActionCount: number;

  chain: LLMChain;

  outputParser: AutoGPTOutputParser;

  tools: ObjectTool[];

  feedbackTool?: Tool;

  maxIterations: number;

  // Currently not generic enough to support any text splitter.
  textSplitter: TokenTextSplitter;

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

  stop(): void {
    this.running = false;
  }

  public pause(): void {
    this.paused = true;
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  public resume(): void {
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
    }
  }

  async run(
    goals: string[],
    onUpdate: (data: Object) => void,
    onRequestHumanInput: (question: string) => Promise<string | undefined>
  ): Promise<string | undefined> {
    this.running = true;
    this.paused = false;

    let loopCount = 0;
    while (this.running && loopCount < this.maxIterations) {
      if (this.paused) {
        await this.pausePromise;
        this.pausePromise = null;
        this.pauseResolve = null;
        continue;
      }
      loopCount += 1;

      const { text: assistantReply } = await this.chain.call({
        goals,
        user_input: user_input_next_step,
        memory: this.memory,
        messages: this.fullMessageHistory,
      });

      // Print the assistant reply
      console.log(assistantReply);
      this.fullMessageHistory.push(new HumanChatMessage(user_input_next_step));
      this.fullMessageHistory.push(new AIChatMessage(assistantReply));

      const {command, thoughts} = await this.outputParser.parse(assistantReply);
      onUpdate({
        type: "action:start",
        command,
        thoughts,
        rawResponse: assistantReply,
      });
      const tools = this.tools.reduce(
        (acc, tool) => ({ ...acc, [tool.name]: tool }),
        {} as { [key: string]: ObjectTool }
      );
      if (command.name === FINISH_NAME) {
        this.running = false;
        return command.args.response;
      }
      let result: string;
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
              this.running = false;
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
      onUpdate({
        type: "action:end",
        command,
        rawResponse: assistantReply,
        result,
      });

      let memoryToAdd = `Assistant Reply: ${assistantReply}\nResult: ${result} `;
      const documents = await this.textSplitter.createDocuments([memoryToAdd]);
      await this.memory.addDocuments(documents);
      this.fullMessageHistory.push(new SystemChatMessage(result));
    }

    this.running = false;
    return undefined;
  }
}
