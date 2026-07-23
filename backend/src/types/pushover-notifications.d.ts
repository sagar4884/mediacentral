declare module 'pushover-notifications' {
  export default class Push {
    constructor(opts: { user: string; token: string });
    send(msg: any, callback: (err: Error, result: any) => void): void;
  }
}
