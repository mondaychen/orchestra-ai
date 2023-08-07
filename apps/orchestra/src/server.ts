import { Server, Socket } from "socket.io";

import { createAgent, AutoGPTStepInput } from "./conductor";
import PlannerGPT from "./planner/planner";

const agents = new Map<string, ReturnType<typeof createAgent>>();
const planners = new Map<string, PlannerGPT>();

export function initServer() {
  const io = new Server({
    cors: {
      origin: process.env.NODE_ENV === "production" ? false : "*",
    },
  });

  function onUpdate(socket: Socket, data: Object) {
    socket.emit("conductor:output", {
      type: "update",
      data,
    });
  }

  function waitForUserInput(socket: Socket, timeout: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const onUserReply = (msg: string) => {
        socket.off("user:reply", onUserReply); // Remove the listener
        resolve(msg);
      };

      socket.on("user:reply", onUserReply);

      setTimeout(() => {
        socket.off("user:reply", onUserReply); // Remove the listener
        reject(new Error("Timeout waiting for user input"));
      }, timeout);
    });
  }

  async function onRequestHumanInput(
    message: string,
    socket: Socket
  ): Promise<string | undefined> {
    socket.emit("conductor:output", {
      type: "request-human-input",
      content: message,
    });
    try {
      const userInput = await waitForUserInput(socket, 2 * 60000); // Wait for user input for up to 2 minutes
      return userInput;
    } catch (err) {
      console.error(err);
      return undefined; // Return empty string if timeout or error occurs
    }
  }

  function run(socket: Socket, goal: string, stepsInput?: AutoGPTStepInput[]) {
    if (agents.has(socket.id)) {
      console.warn("Agent already running for socket id: ", socket.id);
      return;
    }
    console.log("running autogpt with goal: ", goal);
    const agent = createAgent();
    agents.set(socket.id, agent);
    agent.on("update", (data) => onUpdate(socket, data));
    if (stepsInput) {
      agent.setPendingSteps(stepsInput);
    }
    agent
      .run([goal], (message: string) => onRequestHumanInput(message, socket))
      .then((response) => {
        console.log("final response: ", response);
        socket.emit("conductor:output", {
          type: "final-response",
          content: response,
        });
        agents.delete(socket.id);
      })
      .catch((err) => {
        console.error(err);
      });
    socket.emit("conductor:output", {
      type: "start",
      goal,
    });
  }

  function stopAgentRun(socket: Socket) {
    const agent = agents.get(socket.id);
    if (agent) {
      agent.stop("Cancelled by user");
      console.log("agent stopped: cancelled by user");
      agents.delete(socket.id);
    }
  }

  function resumeAgentRun(socket: Socket, data: any) {
    run(socket, data.goal, data.steps);
  }

  function plannerStart(socket: Socket, text: string) {
    if (planners.has(socket.id)) {
      console.warn("Planner already running for socket id: ", socket.id);
      return;
    }
    console.log("starting planner ");
    const planner = new PlannerGPT();
    planners.set(socket.id, planner);
    plannerClarify(socket, text);
  }

  function plannerClarify(socket: Socket, text: string) {
    const planner = planners.get(socket.id);
    if (planner) {
      console.log("running clarify with text: ", text);
      const response = planner.clarify(text);
      socket.emit("planner:output", {
        type: "clarify",
        content: response,
      });
    }
  }

  function plannerPolish(socket: Socket, text: string) {
    const planner = planners.get(socket.id);
    if (planner) {
      console.log("running polish with text: ", text);
      const response = planner.polishPlan(text);
      socket.emit("planner:output", {
        type: "polish",
        content: response,
      });
    }
  }

  io.on("connection", (socket) => {
    console.log("a user connected");
    // socket.on("user:plan_start", (text) => {
    //   plannerClarify(socket, text);
    // });
    // socket.on("user:plan_clarify", (text) => {
    //   plannerStart(socket, text);
    // });
    // socket.on("user:plan_polish", (text) => {
    //   plannerPolish(socket, text);
    // });
    socket.on("user:input", (msg) => {
      run(socket, msg);
    });
    socket.on("user:stop", () => {
      stopAgentRun(socket);
    });
    socket.on("user:resume", (data) => {
      resumeAgentRun(socket, data);
    });
    socket.on("disconnect", () => {
      console.log("user disconnected");
    });
  });

  io.listen(3044);
  console.log("SocketIO server listening on ws://127.0.0.1:3044");
}
