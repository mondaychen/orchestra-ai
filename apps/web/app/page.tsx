"use client";

// layout
import "primeflex/primeflex.css";
//theme
import "primereact/resources/themes/mdc-light-indigo/theme.css";
//core
import "primereact/resources/primereact.min.css";
import 'primeicons/primeicons.css';
        
import "./global.css";

import { useEffect, useState, useRef } from "react";
import Chatbox from './components/chatbox';
import type { ChatMessage, Status } from "./components/chatbox";
        
import { io, Socket } from "socket.io-client";

export default function Page() {
  const socketRef = useRef<Socket>();
  const [status, setStatus] = useState<Status>("disconnected");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{
    type: "conductor",
    content: "Hello. What can I do for you?",
  }]);
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
      if (data.type === "request-human-input") {
        setStatus("pending-input");
        setChatHistory((prev) => [...prev, { type: "conductor", content: data.content }]);
      } else if (data.type === "final-response") {
        setStatus("done");
        setChatHistory((prev) => [...prev, { type: "conductor", content: data.content }]);
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

  return (
    <>
    <h1>AutoGPT, but instructable</h1>
    <div className="grid">
      <div className="col-fixed w-5">
        <Chatbox
          status={status}
          onStart={start}
          onReply={onReply}
          chatHistory={chatHistory}
        />
      </div>
    </div>
    </>
  );
}
