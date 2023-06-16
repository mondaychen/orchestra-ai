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

type AutoGPTState = "idle" | "running" | "finished";

export class AutoGPT {
  state: AutoGPTState;

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
    this.state = "idle";
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

  async run(
    goals: string[],
    onUpdate: (data: Object) => void,
    onRequestHumanInput: (question: string) => Promise<string | undefined>
  ): Promise<string | undefined> {
    const user_input_next_step =
      "Determine which next command to use, and respond using the format specified above:";
    let loopCount = 0;
    while (loopCount < this.maxIterations) {
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

      const action = await this.outputParser.parse(assistantReply);
      onUpdate(action);
      const tools = this.tools.reduce(
        (acc, tool) => ({ ...acc, [tool.name]: tool }),
        {} as { [key: string]: ObjectTool }
      );
      if (action.name === FINISH_NAME) {
        return action.args.response;
      }
      if (action.name === HUMAN_TOOL_NAME) {
        const humanInput = await onRequestHumanInput(action.args.input);
        if (!humanInput) {
          this.fullMessageHistory.push(
            new SystemChatMessage("Error: No human input received.")
          );
          continue;
        } else if (humanInput === "stop" || humanInput === "quit") {
          console.log("EXITING");
          return "EXITING";
        } else {
          this.fullMessageHistory.push(
            new HumanChatMessage(`${humanInput}\n`)
          );
          continue;
        }
      }
      let result: string;
      if (action.name in tools) {
        const tool = tools[action.name];
        let observation;
        try {
          observation = await tool.call(action.args);
        } catch (e) {
          observation = `Error in args: ${e}`;
        }
        result = `Command ${tool.name} returned: ${observation}`;
      } else if (action.name === "ERROR") {
        result = `Error: ${action.args}. `;
      } else {
        result = `Unknown command '${action.name}'. Please refer to the 'COMMANDS' list for available commands and only respond in the specified JSON format.`;
      }
      onUpdate({
        action: action.name,
        result,
      });

      let memoryToAdd = `Assistant Reply: ${assistantReply}\nResult: ${result} `;
      if (this.feedbackTool) {
        const feedback = `\n${await this.feedbackTool.call("Input: ")}`;
        if (feedback === "q" || feedback === "stop") {
          console.log("EXITING");
          return "EXITING";
        }
        memoryToAdd += feedback;
      }

      const documents = await this.textSplitter.createDocuments([memoryToAdd]);
      await this.memory.addDocuments(documents);
      this.fullMessageHistory.push(new SystemChatMessage(result));
    }

    return undefined;
  }
}
