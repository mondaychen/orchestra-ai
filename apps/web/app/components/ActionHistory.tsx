import CodeMirror from "@uiw/react-codemirror";
import { Button } from "primereact/button";
import { useState } from "react";

export type Action = {
  type: "action:end" | "action:start";
  rawResponse: string;
  action: Object;
  result?: string;
};

export default function ActionHistory({
  actions,
  onPause,
  onResume,
}: {
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

  return (
    <div>
      {actions.length > 0 && (
        <div>
          <Button label={isPaused ? "Resume" : "Pause"} onClick={togglePause} />
        </div>
      )}

      {actions.map((action, i) => (
        <div
          className="action border-black-alpha-10 border-bottom-1 px-2 py-3"
          key={i}
        >
          {action.type === "action:start" ? (
            <div className="start">
              <h3>Action: {action.action["name"]}</h3>
              <div className="mb-2">
                <b>Action:</b>
              </div>
              <CodeMirror
                width="700px"
                editable={false}
                value={JSON.stringify(action.action, null, 2)}
              />
            </div>
          ) : (
            <div className="end">
              <div>
                <b>Result:</b>
              </div>
              <p>{action.result}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
