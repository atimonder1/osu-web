// Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the GNU Affero General Public License v3.0.
// See the LICENCE file in the repository root for full licence text.
// tslint:disable:max-classes-per-file
import Message from 'models/chat/message';
import { MessageJson } from '../chat/chat-api-responses';
import DispatcherAction from './dispatcher-action';

export class ChatChannelLoadEarlierMessages implements DispatcherAction {
  constructor(public channelId: number) {
  }
}

export class ChatChannelPartAction implements DispatcherAction {
  constructor(public channelId: number, public shouldSync = true) {
  }
}

export class ChatChannelSwitchAction implements DispatcherAction {
  constructor(public channelId: number) {
  }
}

export class ChatMessageSendAction implements DispatcherAction {
  constructor(public message: Message) {
  }
}

export class ChatMessageUpdateAction implements DispatcherAction {
  constructor(readonly message: Message, readonly json: MessageJson | null) {
  }
}
