CREATE TABLE users (
  id TEXT PRIMARY KEY,
  oidc_sub TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  webdav_password_hash TEXT,
  quota_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL CHECK (is_dir IN (0,1)),
  r2_key TEXT,
  size INTEGER,
  mime TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (owner_id, parent_id, name)
);
CREATE INDEX idx_nodes_owner_deleted ON nodes(owner_id, deleted_at);

CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  expires_at INTEGER,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_shares_node ON shares(node_id);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE nodes_fts USING fts5(node_id UNINDEXED, name, tokenize = 'trigram');
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(node_id, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
END;
CREATE TRIGGER nodes_au AFTER UPDATE OF name ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
  INSERT INTO nodes_fts(node_id, name) VALUES (new.id, new.name);
END;
