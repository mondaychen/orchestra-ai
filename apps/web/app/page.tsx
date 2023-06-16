"use client";

import { Button, Header } from "ui";
import { useEffect, useState, useRef } from "react";
import {io, Socket} from "socket.io-client";

export default function Page() {
  const socketRef = useRef<Socket>();
  useEffect(() => {
    socketRef.current = io('ws://127.0.0.1:3044');
    const socket = socketRef.current;
    socket.on("connect", () => {
      console.log("connected");
    });
    socket.on("disconnect", () => {
      console.log("disconnected");
    });
    socket.on("conductor:output", (data) => {
      console.log(data);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const [input, setInput] = useState("");

  function start() {
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:input", "write a weather report for my city");
  }

  function onReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const socket = socketRef.current;
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:reply", input);
  }

  return (
    <>
      <Header text="Web" />
      <Button onClick={start} />
      <form onSubmit={onReply}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit">respond</button>
      </form>
    </>
  );
}
