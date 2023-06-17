import CodeMirror from "@uiw/react-codemirror";

export type Action = {
  type: "action:end" | "action:start";
  rawResponse: string;
  action: Object;
  result?: string;
};

export default function ActionHistory({ actions }: { actions: Action[] }) {
  return (
    <div>
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
              <CodeMirror width="700px" editable={false} value={JSON.stringify(action.action, null, 2)} />
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
