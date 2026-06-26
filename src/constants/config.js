// Relay server URLs — update after deployment
export const RELAY_WS_URL   = 'wss://d-chat-relay-server-production.up.railway.app';
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
