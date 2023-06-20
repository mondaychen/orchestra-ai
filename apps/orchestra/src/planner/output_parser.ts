type ParsedMarkdown = {
  [key: string]: {
    content?: string;
    list?: string[];
  };
};

export function convert2obj(markdown: string): ParsedMarkdown {
  const lines = markdown.split("\n");
  let currentHeading = "";
  let currentList: string[] = [];
  let currentContent = "";
  const result: ParsedMarkdown = {};

  for (let line of lines) {
    if (line.startsWith("## ")) {
      // Save the last parsed data
      if (currentHeading) {
        result[currentHeading] =
          currentList.length > 0
            ? { list: currentList }
            : { content: currentContent.trim() };
      }

      currentHeading = line.slice(3).trim();
      currentList = [];
      currentContent = "";
    } else if (line.startsWith("- ")) {
      currentList.push(line.slice(2).trim());
    } else {
      currentContent += line + "\n";
    }
  }

  // Save the last parsed data
  if (currentHeading) {
    result[currentHeading] =
      currentList.length > 0
        ? { list: currentList }
        : { content: currentContent.trim() };
  }

  return result;
}

export function convert2markdown(parsedMarkdown: ParsedMarkdown): string {
  let markdown = "";

  for (const key in parsedMarkdown) {
    markdown += `## ${key}\n`;
    const { content, list } = parsedMarkdown[key];

    if (content != null) {
      markdown += parsedMarkdown[key].content + "\n\n";
    } else if (list != null) {
      for (const item of list) {
        markdown += `- ${item}\n`;
      }
      markdown += "\n";
    }
  }

  return markdown;
}
