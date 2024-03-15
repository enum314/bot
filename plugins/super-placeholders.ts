import { Plugin } from '#bot/plugin';
import escapeStringRegexp from 'escape-string-regexp';
import { z } from 'zod';

const plugin = new Plugin({
    metadata: {
        name: 'super-placeholders',
        description: 'A very useful placeholder plugin.',
        version: '1.0.0',
        author: 'enum314',
        dependencies: {},
        optionalDependencies: {},
    },
    configs: {
        config: z
            .object({
                mustaches: z.string().array().default(['{{', '}}']),
            })
            .strict(),
    },
});

plugin.setup(async ({ configs }) => {
    const { mustaches } = await configs.config.read();

    plugin.api = {
        replace: (str: string, data: Record<string, string>) => {
            const regex = new RegExp(
                `${escapeStringRegexp(mustaches[0])}(.*?)${escapeStringRegexp(mustaches[1])}`,
                'g',
            );

            return str.replace(regex, (_, match) => {
                if (data[match]) {
                    return data[match];
                }

                return '';
            });
        },
    };
});

interface SuperPlaceholdersApi {
    replace: (str: string, data: Record<string, string>) => string;
}

export default plugin as Plugin<SuperPlaceholdersApi>;
