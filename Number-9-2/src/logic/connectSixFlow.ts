    export type ConnectGroupDef = {
    id: string;
    label: string;
    count: number;
    };

    export type ConnectSubmitResult = {
    ok: boolean;
    groupId: string;
    expectedCount: number; // luôn là 6
    got: number;
    done: boolean;
    };

    export class ConnectSixFlow {
    private groups: Map<string, ConnectGroupDef>;
    private connected = new Set<string>();
    private targetCount = 6;

    constructor(groupDefs: ConnectGroupDef[], targetCount = 6) {
        this.groups = new Map(groupDefs.map(g => [g.id, g]));
        this.targetCount = targetCount;
    }

    isConnected(groupId: string) {
        return this.connected.has(groupId);
    }

    /** số nhóm cần nối (count == 6) */
    get totalTargets(): number {
        let n = 0;
        for (const g of this.groups.values()) if (g.count === this.targetCount) n++;
        return n;
    }

    /** số nhóm đã nối đúng */
    get connectedTargets(): number {
        let n = 0;
        for (const id of this.connected.values()) {
        const g = this.groups.get(id);
        if (g?.count === this.targetCount) n++;
        }
        return n;
    }

    submitConnect(groupId: string): ConnectSubmitResult | null {
        const g = this.groups.get(groupId);
        if (!g) return null;

        // đã nối rồi thì coi như không làm gì
        if (this.connected.has(groupId)) {
        return { ok: true, groupId, expectedCount: this.targetCount, got: g.count, done: this.connectedTargets === this.totalTargets };
        }

        const ok = g.count === this.targetCount;
        if (ok) this.connected.add(groupId);

        const done = this.connectedTargets === this.totalTargets;
        return { ok, groupId, expectedCount: this.targetCount, got: g.count, done };
    }
    }
