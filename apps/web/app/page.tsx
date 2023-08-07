"use client";

// layout
import "primeflex/primeflex.css";
//theme
import "primereact/resources/themes/mdc-light-indigo/theme.css";
//core
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";

import "./global.css";

import { useEffect, useState, useRef } from "react";
import Chatbox from "./components/chatbox";
import type { ChatMessage, Status } from "./components/chatbox";
import ActionHistory from "./components/ActionHistory";
import type { Action } from "./components/ActionHistory";

import { io, Socket } from "socket.io-client";

export default function Page() {
  const socketRef = useRef<Socket>();
  const [status, setStatus] = useState<Status>("disconnected");
  const [goal, setGoal] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      type: "conductor",
      content: "Hello. What can I do for you?",
    },
  ]);
  const [actions, setActions] = useState<Action[]>([]);
  useEffect(() => {
    socketRef.current = io("ws://127.0.0.1:3044");
    const socket = socketRef.current;
    socket.on("connect", () => {
      console.log("connected");
      setStatus("idle");
    });
    socket.on("disconnect", () => {
      console.log("disconnected");
      setStatus("disconnected");
    });
    socket.on("conductor:output", (data) => {
      if (data.type === "start") {
        setGoal(data.goal);
      }
      if (data.type === "request-human-input") {
        setStatus("pending-input");
        setChatHistory((prev) => [
          ...prev,
          { type: "conductor", content: data.content },
        ]);
      } else if (data.type === "final-response") {
        setStatus("idle");
        setChatHistory((prev) => [
          ...prev,
          { type: "conductor", content: data.content },
        ]);
      } else if (data.type === "update") {
        console.log(data.data);
        setActions(data.data.steps);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  function start(input: string) {
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:input", input);

    setStatus("pending-output");
    setChatHistory((prev) => [...prev, { type: "user", content: input }]);
  }

  function onReply(input: string) {
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:reply", input);
    setStatus("pending-output");
    setChatHistory((prev) => [...prev, { type: "user", content: input }]);
  }

  function onPause() {
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:stop");
  }

  function onResume(actions: Action[]) {
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:resume", {
      steps: actions,
      goal,
    });
  }

  return (
    <>
      <div className="grid">
        <div className="col-fixed" style={{ width: "500px" }}>
          <h1>MetaAgent</h1>
          <Chatbox
            status={status}
            onStart={start}
            onReply={onReply}
            chatHistory={chatHistory}
          />
        </div>
        <div className="col">
          <ActionHistory
            goal={goal}
            actions={actions}
            onPause={onPause}
            onResume={onResume}
          />
        </div>
      </div>
    </>
  );
}
