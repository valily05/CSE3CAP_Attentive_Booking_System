// The network boundary for component tests: real fetch, fake API responses.
import { setupServer } from "msw/node";

export const server = setupServer();
