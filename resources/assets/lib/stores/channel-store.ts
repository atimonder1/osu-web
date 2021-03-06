// Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the GNU Affero General Public License v3.0.
// See the LICENCE file in the repository root for full licence text.

import {
  ChatChannelPartAction,
  ChatChannelSwitchAction,
  ChatMessageSendAction,
  ChatMessageUpdateAction,
} from 'actions/chat-actions';
import DispatcherAction from 'actions/dispatcher-action';
import { UserLogoutAction } from 'actions/user-login-actions';
import { dispatch, dispatchListener } from 'app-dispatcher';
import ChatAPI from 'chat/chat-api';
import { ChannelJson, GetUpdatesJson, MessageJson, PresenceJson } from 'chat/chat-api-responses';
import * as _ from 'lodash';
import { groupBy } from 'lodash';
import { action, computed, observable, runInAction } from 'mobx';
import Channel from 'models/chat/channel';
import Message from 'models/chat/message';
import core from 'osu-core-singleton';
import UserStore from './user-store';

@dispatchListener
export default class ChannelStore {
  @observable channels = observable.map<number, Channel>();
  @observable loaded: boolean = false;

  private api = new ChatAPI();

  @computed
  get channelList(): Channel[] {
    return [...this.nonPmChannels, ...this.pmChannels];
  }

  @computed
  get maxMessageId(): number {
    const channelArray = Array.from(this.channels.toJS().values());
    const max = _.maxBy(channelArray, 'lastMessageId');

    return max == null ? -1 : max.lastMessageId;
  }

  @computed
  get nonPmChannels(): Channel[] {
    const sortedChannels: Channel[] = [];
    this.channels.forEach((channel) => {
      if (channel.type !== 'PM' && channel.metaLoaded) {
        sortedChannels.push(channel);
      }
    });

    return sortedChannels.sort((a, b) => {
      if (a.name === b.name) {
        return 0;
      }

      return a.name > b.name ? -1 : 1;
    });
  }

  @computed
  get pmChannels(): Channel[] {
    const sortedChannels: Channel[] = [];
    this.channels.forEach((channel) => {
      if (channel.newPmChannel || (channel.type === 'PM' && channel.metaLoaded)) {
        sortedChannels.push(channel);
      }
    });

    return sortedChannels.sort((a, b) => {
      // so 'new' channels always end up on top
      if (a.newPmChannel) return -1;
      if (b.newPmChannel) return 1;

      if (a.lastMessageId === b.lastMessageId) {
        return 0;
      }

      return a.lastMessageId > b.lastMessageId ? -1 : 1;
    });
  }

  constructor(protected userStore: UserStore) {
  }

  @action
  addMessages(channelId: number, messages: Message[]) {
    if (_.isEmpty(messages)) {
      return;
    }

    this.getOrCreate(channelId).addMessages(messages);
  }

  @action
  addNewConversation(json: ChannelJson, message: MessageJson) {
    const channel = this.getOrCreate(json.channel_id);
    channel.updateWithJson(json);
    channel.lastReadId = message.message_id;

    return channel;
  }

  findPM(userId: number): Channel | null {
    if (userId === core.currentUser?.id) {
      return null;
    }

    for (const [, channel] of this.channels) {
      if (channel.type !== 'PM') {
        continue;
      }

      if (channel.users.includes(userId)) {
        return channel;
      }
    }

    return null;
  }

  @action
  flushStore() {
    this.channels = observable.map<number, Channel>();
    this.loaded = false;
  }

  get(channelId: number): Channel | undefined {
    return this.channels.get(channelId);
  }

  @action
  getOrCreate(channelId: number): Channel {
    let channel = this.channels.get(channelId);

    if (!channel) {
      channel = new Channel(channelId);
      this.channels.set(channelId, channel);
    }

    return channel;
  }

  handleDispatchAction(event: DispatcherAction) {
    if (event instanceof ChatMessageSendAction) {
      this.handleChatMessageSendAction(event);
    } else if (event instanceof ChatMessageUpdateAction) {
      const channel: Channel = this.getOrCreate(event.message.channelId);
      channel.updateMessage(event.message, event.json);
      channel.resortMessages();
    } else if (event instanceof UserLogoutAction) {
      this.flushStore();
    }
  }

  @action
  partChannel(channelId: number) {
    this.channels.delete(channelId);
  }

  @action
  updateWithJson(updateJson: GetUpdatesJson) {
    this.updateWithPresence(updateJson.presence);

    const groups = groupBy(updateJson.messages, 'channel_id');
    for (const key of Object.keys(groups)) {
      const channelId = parseInt(key, 10);
      this.handleChatChannelNewMessages(channelId, groups[channelId]);
    }

    // TODO: convert silence handling back to action when updating through websocket is figured out.
    const silencedUserIds = new Set<number>(updateJson.silences.map((json) => json.user_id));
    this.removePublicMessagesFromUserIds(silencedUserIds);
  }

  @action
  updateWithPresence(presence: PresenceJson) {
    presence.forEach((json) => {
      this.getOrCreate(json.channel_id).updatePresence(json);
    });

    // remove parted channels
    this.channels.forEach((channel) => {
      if (channel.newPmChannel) {
        return;
      }

      if (!presence.find((json) => json.channel_id === channel.channelId)) {
        dispatch(new ChatChannelPartAction(channel.channelId, false));
      }
    });

    this.loaded = true;
  }

  @action
  private handleChatChannelNewMessages(channelId: number, json: MessageJson[]) {
    const messages = json.map((messageJson) => {
      if (messageJson.sender != null) this.userStore.getOrCreate(messageJson.sender_id, messageJson.sender);
      return Message.fromJson(messageJson);
    });

    if (messages.length === 0) return;

    const channel = this.channels.get(channelId);
    if (channel == null) return;

    channel.addMessages(messages);
    channel.loaded = true;
  }

  @action
  private async handleChatMessageSendAction(event: ChatMessageSendAction) {
    const message = event.message;
    const channel = this.getOrCreate(message.channelId);
    channel.addMessages(message, true);

    try {
      if (channel.newPmChannel) {
        const users = channel.users.slice();
        const userId = users.find((user) => {
          return user !== currentUser.id;
        });

        if (userId == null) {
          console.debug('sendMessage:: userId not found?? this shouldn\'t happen');
          return;
        }

        const response = await this.api.newConversation(userId, message);
        runInAction(() => {
          this.channels.delete(message.channelId);
          const newChannel = this.addNewConversation(response.channel, response.message);
          dispatch(new ChatChannelSwitchAction(newChannel.channelId));
        });
      } else {
        const response = await this.api.sendMessage(message);
        dispatch(new ChatMessageUpdateAction(message, response));
      }
    } catch (error) {
      dispatch(new ChatMessageUpdateAction(message, null));
      // FIXME: this seems like the wrong place to tigger an error popup.
      osu.ajaxError(error);
    }
  }

  @action
  private removePublicMessagesFromUserIds(userIds: Set<number>) {
    this.nonPmChannels.forEach((channel) => {
      channel.removeMessagesFromUserIds(userIds);
    });
  }
}
