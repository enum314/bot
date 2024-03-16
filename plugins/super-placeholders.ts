import escapeStringRegexp from "escape-string-regexp";
import { flatten } from "flat";
import { z } from "zod";

import { Plugin } from "#bot/plugin";

const plugin = new Plugin({
  metadata: {
    name: "super-placeholders",
    description: "A very useful placeholder plugin.",
    version: "1.0.1",
    author: "enum314",
    dependencies: {},
    optionalDependencies: {},
  },
  configs: {
    config: z
      .object({
        mustaches: z.string().array().default(["{{", "}}"]),
      })
      .strict(),
  },
});

plugin.setup(async ({ configs }) => {
  const { mustaches } = await configs.config.read();

  (plugin.api as SuperPlaceholdersApi) = {
    replace: (content: string, data: Record<string, any>): string => {
      const flattenedData = flatten(data) as Record<
        string,
        string | number | bigint | boolean
      >;

      // Regex pattern to match placeholders like {{name}} or {{user.name}}
      const placeholderRegex = new RegExp(
        `${escapeStringRegexp(mustaches[0])}(.*?)${escapeStringRegexp(
          mustaches[1]
        )}`,
        "g"
      );

      // Replace all occurrences of placeholders in the content
      return content.replace(placeholderRegex, (_, placeholder) => {
        // Check if the placeholder exists in the flattened data object
        if (placeholder in flattenedData) {
          return String(flattenedData[placeholder]);
        } else {
          // Return an empty string if the placeholder is not found
          return "";
        }
      });
    },
  };
});

interface SuperPlaceholdersApi {
  replace: (content: string, data: Record<string, string>) => string;
}

export default plugin as Plugin<SuperPlaceholdersApi>;
