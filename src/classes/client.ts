import { Client as DiscordClient, Collection } from 'discord.js';

import Logger from '../utils/logger.js';
import type { Command } from './command.js';
import Dispatcher from './dispatcher.js';
import { PluginManager } from './plugin-manager.js';

export class Client<
    Ready extends boolean = boolean,
> extends DiscordClient<Ready> {
    public readonly commands: Collection<string, Command> = new Collection();
    public readonly logger: typeof Logger = Logger;
    public readonly plugins: PluginManager = new PluginManager(
        <DiscordClient<true>>this,
    );
    public readonly dispatcher: Dispatcher = new Dispatcher(
        <DiscordClient<true>>this,
    );
}

declare module 'discord.js' {
    export interface Client {
        readonly commands: Collection<string, Command>;
        readonly plugins: PluginManager;
        readonly logger: typeof Logger;
        readonly dispatcher: Dispatcher;
    }
}
