import { ChatOpenAI } from "langchain/chat_models/openai";
import { HumanMessage, SystemMessage, BaseMessage } from "langchain/schema";
import {
  SYSTEM_PROMPT,
  USER_CLARIYING_PROMPT,
  USER_POLISHING_PROMPT,
} from "./prompt";

function extractMarkdown(text: string): string {
  const regex = /```([\s\S]*?)```/;
  const match = regex.exec(text);

  if (match) {
    return match[1];
  }
  console.error("No match found");
  return "";
}

export default class PlannerGPT {
  private chat: ChatOpenAI;
  private messageHistory: InstanceType<typeof BaseMessage>[] = [];
  constructor() {
    this.chat = new ChatOpenAI({
      temperature: 0.1,
      modelName: "gpt-4",
      verbose: true,
    });
    this.resetConversation();
  }

  resetConversation(humanMessages?: InstanceType<typeof HumanMessage>[]) {
    this.messageHistory = [
      new SystemMessage(SYSTEM_PROMPT),
      ...(humanMessages ?? []),
    ];
  }

  async clarify(text: string = ""): Promise<string> {
    const humanMessage = new HumanMessage(`${text} \n${USER_CLARIYING_PROMPT}`);
    const response = await this.chat.call([
      ...this.messageHistory,
      humanMessage,
    ]);
    this.messageHistory.push(humanMessage);
    this.messageHistory.push(response);

    return response.text;
  }

  async polishPlan(text: string = ""): Promise<string> {
    const humanMessage = new HumanMessage(`${text} \n${USER_POLISHING_PROMPT}`);
    const response = await this.chat.call([
      ...this.messageHistory,
      humanMessage,
    ]);
    const newPlan = extractMarkdown(response.text);
    this.resetConversation([new HumanMessage(`\`\`\`\n${newPlan}\`\`\`\n`)]);

    return response.text;
  }
}
