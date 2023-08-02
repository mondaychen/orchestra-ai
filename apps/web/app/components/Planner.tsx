import { useState } from "react";
import { InputTextarea } from "primereact/inputtextarea";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { ProgressSpinner } from "primereact/progressspinner";

export type ChatMessage = {
  type: "user" | "planner";
  content: string | null;
};

export type PlannerStatus =
  | "disconnected"
  | "idle"
  | "pending-input"
  | "pending-output"
  | "error"
  | "done";

interface PlannerFormInput {
  goal: string;
  params: string[];
  desc: string;
  constrains: string;
  tools: string;
}

const DEFAULT_MARKDOWN = `
## TBD
-
-

## Goals

## Description

## CONSTRAINTS

## Tools
- search: a search engine. useful for when you need to answer questions about current events. input should be a search query.
- RequestsGetTool: a tool to make HTTP requests
`;

function PlannerForm({ onSubmit }: { onSubmit: (input: string) => void }) {
  const [input, setInput] = useState(DEFAULT_MARKDOWN);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(input);
      }}
    >
      <InputTextarea value={input} onChange={(e) => setInput(e.target.value)} />
      <Button type="submit" label="Submit" />
    </form>
  );
}

export default function Planner({
  onStart,
  onReply,
  chatHistory,
  status,
}: {
  status: PlannerStatus;
  onStart: (goal: string) => void;
  onReply: (input: string) => void;
  chatHistory: ChatMessage[];
}) {
  const [input, setInput] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        {status === "pending-output" && (
          <div className="flex justify-content-center">
            <div className="flex">
              <ProgressSpinner />
            </div>
          </div>
        )}
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
