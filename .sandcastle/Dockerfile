# Sandbox image for the "Agent on Issue" workflow.
#
# Based on sandcastle's canonical Claude Code image (node base + a UID-aligned
# `agent` user + the Claude Code CLI), with Deno added so the agent can run
# `deno task test` for this repo.
#
# Build with host UID/GID so bind-mounted files share an owner (sandcastle's
# docker() sandbox defaults the container UID/GID to the host user's):
#   docker build -t hotsauce-agent \
#     --build-arg AGENT_UID=$(id -u) --build-arg AGENT_GID=$(id -g) .sandcastle
FROM node:22-bookworm

# System dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  unzip \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Build-args for UID/GID alignment: defaults match the host user so image-built
# files and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Claude Code CLI (the agent the workflow runs)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Deno (so the agent can run `deno task test` for this repo)
RUN curl -fsSL https://deno.land/install.sh | sh

# Expose both CLIs on PATH
ENV DENO_INSTALL="/home/agent/.deno"
ENV PATH="/home/agent/.deno/bin:/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# Sandcastle bind-mounts the git worktree and overrides the working directory at
# container start, then execs the agent itself; keep the container alive.
ENTRYPOINT ["sleep", "infinity"]
