declare namespace Express {
  interface Request {
    requestId: string;
    userId?: string;
    username?: string;
  }
}
