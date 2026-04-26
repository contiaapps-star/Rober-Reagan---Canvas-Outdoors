export type AuthedUser = {
  id: string;
  email: string;
  role: 'admin' | 'agency';
};

export type AppEnv = {
  Variables: {
    requestId: string;
    user?: AuthedUser;
  };
};
