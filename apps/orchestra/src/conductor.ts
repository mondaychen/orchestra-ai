import { AutoGPT } from "./autogpt";
import { ReadFileTool, WriteFileTool, SerpAPI } from "langchain/tools";
import { NodeFileStore } from "langchain/stores/file/node";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ChatOpenAI } from "langchain/chat_models/openai";

const store = new NodeFileStore('tmp_file_store');

const tools = [
  new ReadFileTool({ store }),
  new WriteFileTool({ store }),
  new SerpAPI(process.env.SERPAPI_API_KEY, {
    hl: "en",
    gl: "us",
  }),
];

const vectorStore = new HNSWLib(new OpenAIEmbeddings(), {
  space: "cosine",
  numDimensions: 1536,
});

export const autogpt = AutoGPT.fromLLMAndTools(
  new ChatOpenAI({ temperature: 0, verbose: true }),
  tools,
  {
    memory: vectorStore.asRetriever(),
    aiName: "Conductor",
    aiRole: "Assistant",
  }
);
