import { StructuredTool } from "langchain/tools";

export type ObjectTool = StructuredTool;

export const FINISH_NAME = "finish";

export interface AutoGPTReply {
  command: AutoGPTCommand;
  thoughts?: Object | undefined;
}

export interface AutoGPTCommand {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>;
}
