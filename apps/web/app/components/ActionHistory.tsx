import CodeMirror from "@uiw/react-codemirror";
import { Button } from "primereact/button";
import { useState } from "react";

export type Action = {
  userMessage: string | undefined;
  assistantReply: string;
  parsed: {
    thoughts?: Object;
    command: Object;
  }
  result?: string | undefined;
};

export default function ActionHistory({
  goal,
  actions,
  onPause,
  onResume,
}: {
  goal: string;
  actions: Action[];
  onPause: () => void;
  onResume: () => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  function togglePause() {
    setIsPaused((prev) => !prev);
    if (isPaused) {
      onResume();
    } else {
      onPause();
    }
  }
  if (goal == null || goal === "") {
    return null;
  }

  return (
    <div>
      <div>
        <h2>Agent Builder</h2>
        <h3>Goal: {goal}</h3>
        <Button label={isPaused ? "Resume" : "Pause"} onClick={togglePause} />
      </div>

      {actions.map((action, i) => (
        <div
          className="action border-black-alpha-10 border-bottom-1 px-2 py-3"
          key={i}
        >
            <div className="start">
              <h3>Action: {action.parsed.command["name"]}</h3>
              {action.parsed.thoughts != null && (
                <div>
                  <div className="mb-2">
                    <b>Thoughts:</b>
                  </div>
                  <CodeMirror
                    width="800px"
                    editable={true}
                    value={JSON.stringify(action.parsed.thoughts, null, 2)}
                  />
                </div>
              )}
              <div className="mb-2">
                <b>Command:</b>
              </div>
              <CodeMirror
                width="800px"
                editable={true}
                value={JSON.stringify(action.parsed.command, null, 2)}
              />
            </div>

            <div className="end">
              <div>
                <b>Result:</b>
              </div>
              <p>{action.result}</p>
            </div>
        </div>
      ))}
    </div>
  );
}
