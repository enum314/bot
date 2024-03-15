import type { ChatInputCommandInteraction, ClientEvents } from 'discord.js';
import type winston from 'winston';
import type { z } from 'zod';

import type { Client } from '../classes/client.js';
import type { Command } from '../classes/command.js';
import type { Configuration } from '../classes/configuration.js';

export type ClientEventListener<ClientEvent extends keyof ClientEvents> = (
    ...args: ClientEvents[ClientEvent]
) => any;

export type InhibitorFunction = (
    interaction: ChatInputCommandInteraction<'cached'>,
    command: Command,
) => boolean | Promise<boolean>;

export type PluginConfiguration<
    Schema extends z.ZodType<any, any, any> = z.ZodObject<
        any,
        'strict',
        z.ZodTypeAny,
        any,
        any
    >,
> = {
    [k: string]: z.infer<Schema>;
};

export interface Context<PluginConfig extends PluginConfiguration> {
    client: Client<true>;
    configs: {
        [property in keyof PluginConfig]: Configuration<
            z.infer<PluginConfig[property]>
        >;
    };
    logger: {
        info: (message: string) => winston.Logger;
        error: (message: string) => winston.Logger;
        warn: (message: string) => winston.Logger;
    };
}
