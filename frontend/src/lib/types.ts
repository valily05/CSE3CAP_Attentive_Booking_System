// Shapes of the Go API's JSON. Keep in sync with backend/internal/store and app.

export type AgeGroup = "adult" | "child_teen" | "family_couple";
export type Mode = "online" | "in_person";
export type Channel = "chat" | "voice" | "video";
export type SessionType = Channel | "in_person";
export type BookingStatus = "waiting_payment" | "confirmed" | "attended" | "no_show" | "cancelled" | "expired" | "paid_late";
export type Role = "client" | "psychologist" | "admin";

export type Location = { id: string; name: string; active: boolean; address?: string; mapsUrl?: string };
export type Service = { categoryId?:string; nameId?:string; durationNote?:string; id: string; name: string; lengthMinutes: number; ageGroup: AgeGroup; active: boolean };
export type Catalog = { locations: Location[]; services: Service[] };

export type Psychologist = {
  directoryMetadata?: { sourceId?:string;areasOfExperience?:string[];gender?:"female"|"male"|"non_binary";experienceMinYears?:number;experienceLabel?:string };
  id: string;
  name: string;
  title: string;
  specialty: string;
  bio: string;
  photoUrl: string;
  sessionTypes: SessionType[];
  locationIds: string[];
  serviceIds: string[];
  nextOpen?: string | null;
  week?: { date: string; count: number }[];
};

export type Slot = { Start: string; End: string; Mode: Mode; LocationID: string };
export type Day = { date: string; slots: Slot[] };

export type Booking = {
 psychologistPhoto?:string;psychologistSpecialty?:string;bookingMethod?:"self_service"|"admin_assisted"|"";bookedByName?:string;createdAt?:string;updatedAt?:string;
  isUrgent?: boolean;
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  psychologistId: string;
  psychologistName: string;
  serviceId: string;
  serviceName: string;
  mode: Mode;
  onlineChannel?: Channel;
  locationId?: string;
  locationName?: string;
  start: string;
  end: string;
  status: BookingStatus;
  canChange?: boolean;
  changeDeadline?: string;
};

export type Created = { id: string; code: string; changeDeadline: string };
export type Me = { role: Role; name: string; email: string; locale?: "en" | "id" };
