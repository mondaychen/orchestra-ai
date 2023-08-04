import { Tool } from "langchain/tools";

export type WebScraperParameters = {};

export const parseInputs = (inputs: string): [string, string] => {
  const [baseUrl, task] = inputs.split(",").map((input) => {
    let t = input.trim();
    t = t.startsWith('"') ? t.slice(1) : t;
    t = t.endsWith('"') ? t.slice(0, -1) : t;
    // it likes to put / at the end of urls, wont matter for task
    t = t.endsWith("/") ? t.slice(0, -1) : t;
    return t.trim();
  });

  return [baseUrl, task];
};

/**
 * Wrapper around a WebScraper workflow based on Flowise.
 */
export class WebScraper extends Tool {
  toJSON() {
    return this.toJSONNotImplemented();
  }

  protected params?: WebScraperParameters = {};

  constructor(params?: WebScraperParameters) {
    super();
    this.params = params;
  }

  public name = "web-scraper";

  /** @ignore */
  async _call(inputs: string) {
    const [url, task] = parseInputs(inputs);
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: task || "Provide a summary of the page",
        overrideConfig: {
          url,
        },
      }),
    };

    const res = await fetch(
      "http://localhost:3000/api/v1/prediction/8564377d-3d9f-4c34-adac-2a230fdb883e",
      options
    );

    if (!res.ok) {
      throw new Error(
        `Got ${res.status} error from Flowise tool ${this.name}: ${res.statusText}`
      );
    }

    const json = await res.json();

    if (json.text) {
      return json.text;
    }

    return "No result found";
  }

  description = `Use this tool when you have a url to a web page and want to have an agent anwser a question based on the content of the page.
    input should be a comma separated list of "ONE valid http URL including protocol","what question you have for the page or empty string for a summary".`;
}
