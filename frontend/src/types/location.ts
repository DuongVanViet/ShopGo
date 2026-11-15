export interface StoreAddress {
  street: string;
  ward: string;
  district?: string;
  city: string;
}
export interface LocationPin {
  latitude: number;
  longitude: number;
  source: 'GPS' | 'MAP' | 'COORDINATES';
  accuracyMeters?: number;
}
export interface SellerStore {
  id: string;
  name: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  addressDetails: StoreAddress;
  latitude: number;
  longitude: number;
  locationSource: LocationPin['source'];
  locationAccuracyMeters: number | null;
  locationVersion: number;
  locationConfirmedAt: string;
}
