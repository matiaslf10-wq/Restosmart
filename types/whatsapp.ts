export type WhatsAppConnectionStatus =
  | 'pending'
  | 'connected'
  | 'expired'
  | 'error'
  | 'disconnected';

export type WhatsAppConnection = {
  id: number;
  tenant_id: string;
  local_id: string | null;
  add_on_enabled: boolean;
  status: WhatsAppConnectionStatus;
  provider: string;
  waba_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  business_account_id: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  webhook_subscribed_at: string | null;
  app_scope_granted: boolean;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IncomingWhatsAppMessage = {
  from: string;
  text: string;
  messageId: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export type MetaWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
          button?: {
            text?: string;
            payload?: string;
          };
          interactive?: {
            type?: string;
            button_reply?: {
              id?: string;
              title?: string;
            };
            list_reply?: {
              id?: string;
              title?: string;
              description?: string;
            };
          };
        }>;
      };
    }>;
  }>;
};