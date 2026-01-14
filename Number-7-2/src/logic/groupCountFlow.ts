    export type GroupDef = {
    id: string;
    label: string;
    count: number;
    };

    export type FlowPhase = 'IDLE' | 'AWAIT_ANSWER' | 'DONE';

    export type SubmitResult = {
    ok: boolean;
    groupId: string;
    expected: number;
    got: number;
    done: boolean;
    };

    export class GroupCountFlow {
    private groups: Map<string, GroupDef>;
    private completed = new Set<string>();
    private _phase: FlowPhase = 'IDLE';
    private _activeGroupId: string | null = null;

    constructor(groupDefs: GroupDef[]) {
        this.groups = new Map(groupDefs.map((g) => [g.id, g]));
        if (groupDefs.length === 0) this._phase = 'DONE';
    }

    get phase(): FlowPhase {
        return this._phase;
    }

    isCompleted(groupId: string): boolean {
        return this.completed.has(groupId);
    }

    get completedCount(): number {
        return this.completed.size;
    }

    get totalCount(): number {
        return this.groups.size;
    }

    selectGroup(groupId: string): GroupDef | null {
        const g = this.groups.get(groupId);
        if (!g) return null;

        if (!this.completed.has(groupId)) {
        this._activeGroupId = groupId;
        this._phase = 'AWAIT_ANSWER';
        }
        return g;
    }

    submitCount(n: number): SubmitResult | null {
        if (this._phase !== 'AWAIT_ANSWER') return null;
        if (!this._activeGroupId) return null;

        const g = this.groups.get(this._activeGroupId);
        if (!g) return null;

        const ok = n === g.count;
        if (ok) this.completed.add(g.id);

        const done = this.completed.size === this.groups.size;

        const groupId = g.id;
        this._activeGroupId = null;
        this._phase = done ? 'DONE' : 'IDLE';

        return { ok, groupId, expected: g.count, got: n, done };
    }
    }
