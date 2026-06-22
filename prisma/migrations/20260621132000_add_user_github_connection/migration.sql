CREATE TABLE "UserGitHubConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "githubUserId" BIGINT NOT NULL,
  "login" TEXT NOT NULL,
  "name" TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT NOT NULL,
  "tokenType" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdated" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserGitHubConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserGitHubConnection_userId_key" ON "UserGitHubConnection"("userId");
CREATE INDEX "UserGitHubConnection_githubUserId_idx" ON "UserGitHubConnection"("githubUserId");
CREATE INDEX "UserGitHubConnection_login_idx" ON "UserGitHubConnection"("login");

ALTER TABLE "UserGitHubConnection" ADD CONSTRAINT "UserGitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
