// Relay server URLs — update after deployment
export const RELAY_WS_URL   = 'ws://zqnfgm3nty47hqxod4h5e53t3m6e3sfsp7e277wt7kjj7bznymjn4oid.onion:8080';
export const RELAY_HTTP_URL = 'https://d-chat-relay-server-production.up.railway.app';

// SecureStore keys — where private key is stored in device secure enclave
export const SECURE_STORE_PRIVATE_KEY = 'dchat_private_key';
export const SECURE_STORE_DEVICE_ID   = 'dchat_device_id';

// SQLite DB filename
export const DB_NAME = 'dchat.db';

// Message status
export const MSG_STATUS = {
  SENT:   'sent',
  STORED: 'stored',
  SEEN:   'seen',
};
