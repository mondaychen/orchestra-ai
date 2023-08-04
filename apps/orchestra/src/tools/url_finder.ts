import { Tool } from "langchain/tools";

export type SerperParameters = {
  gl?: string;
  hl?: string;
};

/**
 * Wrapper around serper.
 *
 * You can create a free API key at https://serper.dev.
 *
 * To use, you should have the SERPER_API_KEY environment variable set.
 */
export class UrlFinder extends Tool {
  toJSON() {
    return this.toJSONNotImplemented();
  }

  protected key: string;

  protected params: Partial<SerperParameters>;

  constructor(
    apiKey: string | undefined,
    params: Partial<SerperParameters> = {}
  ) {
    super();

    if (!apiKey) {
      throw new Error(
        "Serper API key not set."
      );
    }

    this.key = apiKey;
    this.params = params;
  }

  name = "url-finder";

  /** @ignore */
  async _call(input: string) {
    const options = {
      method: "POST",
      headers: {
        "X-API-KEY": this.key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: input,
        ...this.params,
      }),
    };

    const res = await fetch("https://google.serper.dev/search", options);

    if (!res.ok) {
      throw new Error(`Got ${res.status} error from serper: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.organic && json.organic.length > 0) {
      return json.organic.map((result: any) => result.link).join(",");
    }

    return "No good search result found";
  }

  description =
    `a tool useful for when you need to find URLs on the Internet given a search query.
    input should be a search query. outputs a comma separated list of URLs.`;
}