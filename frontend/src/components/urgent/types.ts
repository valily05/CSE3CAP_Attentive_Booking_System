export type UrgentRequest = {
  id: string;
  bookingCode: string;
  customerName: string;
  email: string;
  whatsappNumber: string;
  sessionType: "online" | "onsite";
  locationId: string;
  locationName: string;
  status: string;
  acknowledgedAt: string;
  createdAt: string;
  updatedAt: string;
  workflow: UrgentWorkflow;
};

export type UrgentWorkflow = {
 submittedAt: string;
 waitingMinutes: number;
 clientId: string | null;
 clientName: string | null;
 clientEmail: string | null;
 appointmentId: string | null;
 psychologistId: string | null;
 serviceId: string | null;
 channel: string | null;
 start: string | null;
 assignedAt: string | null;
 confirmedAt: string | null;
 checkedInAt: string | null;
 completedAt: string | null;
 cancelledAt: string | null;
 linkedAt: string | null;
 arrivalStatus: string | null;
 estimatedDepartureAt: string | null;
 arrivalUpdatedAt: string | null;
 readiness: string;
 address: string;
 mapsUrl: string;
 isUrgent: boolean;
};
export type UrgentReceipt = Pick<UrgentRequest, "customerName" | "bookingCode" | "sessionType" | "locationName" | "status"> & {
 workflow: Pick<UrgentWorkflow, "submittedAt" | "arrivalStatus" | "estimatedDepartureAt" | "arrivalUpdatedAt" | "address" | "mapsUrl" | "isUrgent">;
 recent?: boolean;
};
export const urgentStatuses = ["PENDING", "CONTACTED", "CHECKED_IN", "ASSIGNED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
