// The one shape an order takes inside the system. Channel mappers produce it;
// everything downstream (ledger, stock, dashboards) reads only this.

export type CanonicalStatus = "NEW" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "RETURNING" | "RETURNED" | "CANCELLED";

export interface CanonicalItem {
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPriceCentavos: number;
}

export interface CanonicalOrder {
  externalId: string;
  displayId: string | null;
  status: CanonicalStatus;
  rawStatus: string | null;
  /** False when the channel's status was not recognised and NEW was assumed. */
  statusRecognized: boolean;

  placedAt: Date;
  /** When the channel last changed the order — used to date status changes. */
  updatedAt: Date | null;

  totalCentavos: number;
  shippingCentavos: number;
  discountCentavos: number;
  courierFeeCentavos: number;
  isCod: boolean;
  isAbandonedCart: boolean;

  customerName: string | null;
  phone: string | null;
  province: string | null;
  courier: string | null;
  returnReason: string | null;

  landingLink: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;

  items: CanonicalItem[];
}
