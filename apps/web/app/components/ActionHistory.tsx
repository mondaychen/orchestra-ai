import CodeMirror from "@uiw/react-codemirror";
import { Button } from "primereact/button";
import { useState, useRef, useEffect } from "react";
import { InputTextarea } from "primereact/inputtextarea";

export type Action = {
  userMessage: string | undefined;
  assistantReply: string;
  parsed: {
    thoughts?: Object;
    command: Object;
  };
  result?: string | undefined;
};

function syncAssistantReplyFromLocal(action: Action): void {
  action.assistantReply = JSON.stringify(action.parsed, null, 2);
}

function Action({
  action,
  editable,
  onChange,
  onRemove,
}: {
  action: Action;
  editable: boolean;
  onChange: (action: Action) => void;
  onRemove: () => void;
}) {
  return (
    <div className="action border-black-alpha-10 border-bottom-1 px-2 py-3">
      <div className="start">
        <div className="flex align-items-center">
          <h3 className="">Action: {action.parsed.command["name"]}</h3>
          {editable && (
            <Button
              className="m-1"
              icon="pi pi-times"
              rounded
              text
              severity="danger"
              aria-label="Remove"
              onClick={onRemove}
            />
          )}
        </div>
        {action.parsed.thoughts != null && (
          <div>
            <div className="mb-2">
              <b>Thoughts:</b>
            </div>
            <CodeMirror
              width="800px"
              editable={editable}
              value={JSON.stringify(action.parsed.thoughts, null, 2)}
              onChange={(value) => {
                onChange({
                  ...action,
                  parsed: {
                    ...action.parsed,
                    thoughts: JSON.parse(value),
                  },
                });
              }}
            />
          </div>
        )}
        <div className="mb-2">
          <b>Command:</b>
        </div>
        <CodeMirror
          width="800px"
          editable={editable}
          value={JSON.stringify(action.parsed.command, null, 2)}
          onChange={(value) => {
            onChange({
              ...action,
              parsed: {
                ...action.parsed,
                command: JSON.parse(value),
              },
            });
          }}
        />
      </div>

      <div className="end" style={{ maxWidth: "800px" }}>
        <div>
          <b>Result:</b>
        </div>
        <p style={{ wordBreak: "break-word" }}>
          {editable ? (
            <InputTextarea
              className="shadow-2 w-10 mt-2 mb-2 py-3 pr-6"
              value={action.result}
              onChange={(e) => {
                onChange({ ...action, result: e.currentTarget.value });
              }}
            />
          ) : (
            action.result
          )}
        </p>
      </div>
    </div>
  );
}

export default function ActionHistory({
  goal,
  actions,
  onPause,
  onResume,
}: {
  goal: string;
  actions: Action[];
  onPause: () => void;
  onResume: (actions: Action[]) => void;
}) {
  // isPaused = editing mode
  const [isPaused, setIsPaused] = useState(false);
  const [localActions, setLocalActions] = useState(actions);
  const actionsRef = useRef(actions);
  // ignore external changes while editing
  useEffect(() => {
    if (!isPaused) {
      setLocalActions(actions);
    }
    actionsRef.current = actions;
  }, [actions, isPaused]);

  function togglePause() {
    if (isPaused) {
      for (const action of localActions) {
        syncAssistantReplyFromLocal(action);
      }
      onResume(localActions);
    } else {
      onPause();
    }
    setIsPaused((prev) => !prev);
  }
  if (goal == null || goal === "") {
    return null;
  }

  function removeAction(index: number) {
    const newActions = [...localActions];
    newActions.splice(index, 1);
    setLocalActions(newActions);
  }

  return (
    <div>
      <div>
        <h3>Current task: {goal}</h3>
        <Button
          label={isPaused ? "Save & Resume" : "Pause"}
          onClick={togglePause}
        />
      </div>

      {localActions.map((action, i) => (
        <Action
          action={action}
          key={i}
          editable={isPaused}
          onChange={(action: Action) => {
            const newActions = [...localActions];
            newActions[i] = action;
            setLocalActions(newActions);
          }}
          onRemove={() => removeAction(i)}
        />
      ))}
    </div>
  );
}
