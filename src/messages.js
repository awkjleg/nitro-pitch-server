// Private messages between signed-in players, kept in the Ops Durable Object's storage.
//   pm:c:<uidA>~<uidB>  one conversation (uids sorted): the newest KEEP messages
//   pm:i:<uid>          that player's inbox: one line per conversation (name, last message time and text, unread count)
//   pm:b:<uid>          the players they blocked (their game sends its block list with every inbox check)
//   pm:d:<uid>          messages sent today (daily limit)
// Rules: both players need an account; banned or admin-muted senders can't send; nobody can message a player who
// blocked them (or whom they blocked); text is one line, at most MAX_LEN characters, filtered like the lobby chat;
// a few messages a minute and DAILY a day. A new message notifies the recipient's browsers by Web Push (src/push.js).
import {filterText} from './moderation.js';
import {ApiError} from './firebase-auth.js';
export const PM = { KEEP: 50, MAX_LEN: 300, MAX_CONVS: 100, BURST: 5, BURST_MS: 30000, DAILY: 200 };
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CTRL = /[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ﻿￰-￻]/g;
export function cleanMessage(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').replace(CTRL, '').replace(/(\p{M}{3})\p{M}+/gu, '$1').trim();
  return filterText([...s].slice(0, PM.MAX_LEN).join('').trim());
}
const convKey = (a, b) => 'pm:c:' + [a, b].sort().join('~');
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
const Refusal = ApiError;

export class MessageHub {
  // account(uid, token) -> {exists, name, banned} from the Progress object; muted(uid, token) -> true while admin-muted
  constructor(storage, { push = null, account, muted = async () => false, now = () => Date.now() }) {
    this.storage = storage; this.push = push; this.account = account; this.muted = muted; this.now = now; this.bursts = new Map();
  }
  async send(user, b, token) {
    const to = b?.to, text = cleanMessage(b?.text), now = this.now();
    if (!ID.test(to || '') || to === user.uid) throw new Refusal('Pick a player to message');
    if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new Refusal('Type a message');
    const burst = (this.bursts.get(user.uid) || []).filter(t => now - t < PM.BURST_MS);
    if (burst.length >= PM.BURST) throw new Refusal('Slow down: wait a few seconds before sending more', 429);
    const day = Math.floor(now / 864e5), used = await this.storage.get('pm:d:' + user.uid);
    if (used?.day === day && used.n >= PM.DAILY) throw new Refusal('You have sent a lot of messages today. Try again tomorrow.', 429);
    const me = await this.account(user.uid, token);
    if (me?.banned) throw new Refusal('This account is banned', 403);
    if (await this.muted(user.uid, token)) throw new Refusal('You are muted, so you can’t send messages right now', 403);
    if ((await this.storage.get('pm:b:' + user.uid) || []).includes(to)) throw new Refusal('Unblock this player to message them', 403);
    if ((await this.storage.get('pm:b:' + to) || []).includes(user.uid)) throw new Refusal('This player isn’t taking messages from you', 403);
    const them = await this.account(to, null);
    if (!them?.exists || them.banned) throw new Refusal('This player can’t get messages', 404);
    const myName = me?.name || user.username || 'Player', theirName = them.name || 'Player';
    const key = convKey(user.uid, to), conv = await this.storage.get(key) || { msgs: [] };
    const msg = { id: rid(), f: user.uid, tx: text, at: now };
    conv.msgs.push(msg); if (conv.msgs.length > PM.KEEP) conv.msgs.splice(0, conv.msgs.length - PM.KEEP);
    await this.storage.put(key, conv);
    await this.touch(user.uid, to, theirName, msg, false);
    await this.touch(to, user.uid, myName, msg, true);
    burst.push(now); this.bursts.set(user.uid, burst); if (this.bursts.size > 5000) this.bursts.clear();
    await this.storage.put('pm:d:' + user.uid, { day, n: used?.day === day ? used.n + 1 : 1 });
    if (this.push) await this.push.sendToUser(to, { kind: 'pm', from: user.uid, title: myName + ' messaged you', body: 'Open Nitro Pitch to read and reply.', tag: 'np-pm-' + user.uid.slice(0, 40) }, ('pm' + user.uid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)).catch(() => {});
    return { sent: { id: msg.id, me: true, tx: text, at: now } };
  }
  // one line in a player's inbox for the conversation with `other`
  async touch(uid, other, name, msg, unread) {
    const inbox = await this.storage.get('pm:i:' + uid) || {};
    const row = inbox[other] || { n: name, u: 0 };
    row.n = name; row.last = msg.at; row.tx = msg.tx.slice(0, 80); row.mine = msg.f === uid; if (unread) row.u = Math.min(99, (row.u | 0) + 1);
    inbox[other] = row;
    const keys = Object.keys(inbox);
    if (keys.length > PM.MAX_CONVS) for (const k of keys.sort((a, b) => inbox[a].last - inbox[b].last).slice(0, keys.length - PM.MAX_CONVS)) delete inbox[k];
    await this.storage.put('pm:i:' + uid, inbox);
  }
  // the conversation list; the game sends its block list (account ids) with it
  async inbox(user, b) {
    if (Array.isArray(b?.blocks)) await this.storage.put('pm:b:' + user.uid, [...new Set(b.blocks.filter(x => typeof x === 'string' && ID.test(x)))].slice(0, 100));
    const inbox = await this.storage.get('pm:i:' + user.uid) || {}, blocks = await this.storage.get('pm:b:' + user.uid) || [];
    const convs = Object.entries(inbox).filter(([uid]) => !blocks.includes(uid)).map(([uid, r]) => ({ with: uid, name: r.n, last: r.last, tx: r.tx, mine: !!r.mine, unread: r.u | 0 })).sort((a, b) => b.last - a.last);
    return { convs, unread: convs.reduce((n, c) => n + c.unread, 0) };
  }
  // one conversation (newest last); opening it marks it read
  async thread(user, b) {
    const other = b?.with;
    if (!ID.test(other || '') || other === user.uid) throw new Refusal('Pick a player');
    const conv = await this.storage.get(convKey(user.uid, other)) || { msgs: [] }, inbox = await this.storage.get('pm:i:' + user.uid) || {};
    if (inbox[other]?.u) { inbox[other].u = 0; await this.storage.put('pm:i:' + user.uid, inbox); }
    const blocked = (await this.storage.get('pm:b:' + user.uid) || []).includes(other);
    return { with: other, name: inbox[other]?.n || '', blocked, msgs: conv.msgs.map(m => ({ id: m.id, me: m.f === user.uid, tx: m.tx, at: m.at })) };
  }
}
