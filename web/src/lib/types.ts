export type Role = 'client' | 'provider' | 'admin';
export type RequestStatus =
  | 'sent'
  | 'in_review'
  | 'info_requested'
  | 'response_received'
  | 'confirmed'
  | 'declined'
  | 'closed';

export interface Profile {
  id: string;
  pi_username: string;
  display_name: string | null;
  city: string | null;
  role: Role;
  status: 'active' | 'suspended';
}

export interface ProviderRef {
  id: string;
  business_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
}

export interface AppConfig {
  demo_mode: boolean;
  pi_network: 'testnet' | 'mainnet';
  pi_sandbox: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProviderCardData {
  id: string;
  business_name: string;
  bio: string | null;
  specialties: string[];
  service_zones: string[];
  city: string | null;
  image_url: string | null;
  portfolio_count: number;
  category_ids: string[];
  category_names: string[];
  status: string;
}

export interface PortfolioItem {
  id: string;
  provider_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  moderation_status?: 'pending' | 'approved' | 'rejected';
  provider_name?: string | null;
}

export interface ServiceItem {
  id: string;
  provider_id: string;
  category_id: string;
  category_name?: string | null;
  title: string;
  description: string | null;
  is_active: boolean;
}

export interface RequestSummary {
  id: string;
  status: RequestStatus;
  status_label: string;
  status_note: string | null;
  event_type: string;
  event_date: string;
  event_location: string;
  created_at: string;
  updated_at: string;
  category: string | null;
  provider: { id: string; business_name: string; image_url: string | null } | null;
  client?: { name: string };
}

export interface RequestDetail extends RequestSummary {
  guests_approx: number | null;
  theme: string | null;
  colors: string | null;
  requested_services: string | null;
  details: string | null;
  inspiration_urls: string[];
  client_name?: string;
}

export interface Message {
  id: string;
  body: string;
  created_at: string;
  mine: boolean;
  sender: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  request_id: string | null;
  read_at: string | null;
  created_at: string;
}
