"use client";

import { Button, Header } from "ui";
import { useEffect } from "react";
import {io} from "socket.io-client";

export default function Page() {
  let socket;
  useEffect(() => {
    socket = io('ws://127.0.0.1:3044');
    socket.on("connect", () => {
      console.log("connected");
    });
    socket.on("disconnect", () => {
      console.log("disconnected");
    });
    socket.on("conductor:output", (data) => {
      console.log(data);
    });
  }, []);

  function handleClick() {
    if (socket == null || socket.disconnected) {
      console.error("socket is not connected");
      return;
    }
    socket.emit("user:input", "write a weather report for SF today");
  }

  return (
    <>
      <Header text="Web" />
      <Button onClick={handleClick} />
    </>
  );
}
