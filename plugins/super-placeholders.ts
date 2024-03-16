import Mustache from "mustache";
import { z } from "zod";

import { Plugin } from "#bot/plugin";

const plugin = new Plugin({
  metadata: {
    name: "super-placeholders",
    description: "A very useful placeholder plugin.",
    version: "1.0.2",
    author: "enum314",
    dependencies: {},
    optionalDependencies: {},
  },
  configs: {
    config: z
      .object({
        mustaches: z.string().array().length(2).default(["{{", "}}"]),
      })
      .strict(),
  },
});

plugin.setup(async ({ configs }) => {
  const { mustaches } = await configs.config.read();

  Mustache.tags = mustaches as [string, string];

  (plugin.api as SuperPlaceholdersApi) = {
    replace: (content: string, data: Record<string, any>): string => {
      return Mustache.render(content, data);
    },
  };
});

interface SuperPlaceholdersApi {
  replace: (content: string, data: Record<string, string>) => string;
}

export default plugin as Plugin<SuperPlaceholdersApi>;
