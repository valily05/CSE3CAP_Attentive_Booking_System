export const ROOM_ACTIONS = ["lamp", "aircon", "curtains", "guitar", "feelings", "tea", "tower", "sofa", "chair", "books", "plants", "coffee", "rug", "sign", "clock", "welcome", "house", "purifier", "feed"] as const;
export type RoomAction = typeof ROOM_ACTIONS[number];
