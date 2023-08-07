import { useState } from "react";
import { InputTextarea } from "primereact/inputtextarea";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

export type ChatMessage = {
  type: "user" | "conductor";
  content: string | null;
};

export type Status =
  | "disconnected"
  | "idle"
  | "pending-input"
  | "pending-output"
  | "error"
  | "done";

export default function Chatbox({
  onStart,
  onReply,
  chatHistory,
  status,
}: {
  status: Status;
  onStart: (goal: string) => void;
  onReply: (input: string) => void;
  chatHistory: ChatMessage[];
}) {
  const [input, setInput] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInput("");
    if (status === "idle") {
      onStart(input);
    } else if (status === "pending-input") {
      onReply(input);
    }
  }
  return (
    <div>
      {chatHistory.map((message, i) => (
        <div
          className="chat-message border-black-alpha-10 border-bottom-1 px-2 py-3"
          key={i}
        >
          {message.type === "user" ? (
            <div className="user">
              <div>
                <b>User:</b>
              </div>
              <p>{message.content}</p>
            </div>
          ) : (
            <div className="ai">
              <div>
                <b>AI:</b>
              </div>
              <p>{message.content}</p>
            </div>
          )}
        </div>
      ))}
      {status === "disconnected" && (
        <Message
          className="w-full justify-content-start"
          severity="warn"
          text="Waiting for connection..."
        />
      )}
      {status === "error" && (
        <Message
          className="w-full justify-content-start"
          severity="error"
          text="Something went wrong"
        />
      )}
      <form onSubmit={onSubmit} className="relative pt-2 pb-1">
        <InputTextarea
          className="shadow-2 w-full mt-2 mb-2 py-3 pr-6"
          autoResize
          disabled={status === "disconnected" || status === "pending-output"}
          placeholder={status === "idle" ? "What do you want to do?" : "Reply"}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          className="absolute top-50 right-0"
          outlined={input === ""}
          disabled={
            (status !== "idle" && status !== "pending-input") || input === ""
          }
          style={{ transform: "translate(-20%, -50%)" }}
          type="submit"
          icon="pi pi-send"
        ></Button>
      </form>
    </div>
  );
}
