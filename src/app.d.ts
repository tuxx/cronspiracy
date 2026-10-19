declare global {
	namespace App {
		interface Locals {
			ipHash: string;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}
export {};
