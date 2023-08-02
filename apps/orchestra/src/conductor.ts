import { AutoGPT } from "./autogpt";
import { ReadFileTool, WriteFileTool, Serper, RequestsGetTool } from "langchain/tools";
import { NodeFileStore } from "langchain/stores/file/node";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";

const store = new NodeFileStore("tmp_file_store");

const tools = [
  new ReadFileTool({ store }),
  new WriteFileTool({ store }),
  new RequestsGetTool({}, {
    maxOutputLength: 99999,
  }),
  new Serper(process.env.SERPER_API_KEY, {
    hl: "en",
    gl: "us",
  }),
];

export function createAgent() {
  const vectorStore = new HNSWLib(new OpenAIEmbeddings(), {
    space: "cosine",
    numDimensions: 1536,
  });
  
  const chatOpenAI = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-4",
    verbose: true
  });
  return AutoGPT.fromLLMAndTools(
    chatOpenAI,
    tools,
    {
      maxIterations: 10,
      memory: vectorStore.asRetriever(),
      aiName: "MetaAgent",
      aiRole: "an Assistant to help user achieve their goals",
    }
  );
}
