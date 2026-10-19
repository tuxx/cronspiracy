export type VoteValue = 'yes' | 'maybe' | 'no';
export type PollType = 'date' | 'text';

export interface PollOption {
	id: number;
	date: string | null; // YYYY-MM-DD
	startTime: string | null; // HH:MM
	endTime: string | null;
	label: string | null;
}

export interface Participant {
	id: number;
	name: string;
	comment: string | null;
	votes: Record<number, VoteValue>;
	updatedAt: string;
}

export interface PollView {
	id: string;
	type: PollType;
	title: string;
	description: string | null;
	location: string | null;
	organiserName: string | null;
	timezone: string;
	allowMaybe: boolean;
	hideVotes: boolean;
	hideNames: boolean;
	deadline: string | null;
	closed: boolean;
	/** True when closed by the organiser or past the deadline. */
	votingClosed: boolean;
	finalOptionId: number | null;
	expiryDays: number;
	expiresAt: string;
	createdAt: string;
	options: PollOption[];
	participants: Participant[];
	participantCount: number;
	/** Votes are hidden from this viewer until they vote themselves. */
	votesHidden: boolean;
	/** Participant id the viewer authenticated as (via edit token), if any. */
	youId: number | null;
	isAdmin: boolean;
}

export interface NewOption {
	date?: string;
	startTime?: string | null;
	endTime?: string | null;
	label?: string | null;
}

export const LIMITS = {
	title: 120,
	description: 2000,
	location: 200,
	name: 40,
	optionLabel: 100,
	comment: 200
} as const;
