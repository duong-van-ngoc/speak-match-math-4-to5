export interface ConnectGroupDef {
    id: string;
    label: string;
    count: number;
}

export class ConnectSixFlow {
    private groups: ConnectGroupDef[];
    private targetCount: number;
    public connectedTargets: number = 0;
    public totalTargets: number = 0;
    private connectedIds: Set<string> = new Set();

    constructor(groups: ConnectGroupDef[], targetCount: number) {
        this.groups = groups;
        this.targetCount = targetCount;
        // Đếm số nhóm thỏa mãn điều kiện
        this.totalTargets = groups.filter(g => g.count === targetCount).length;
    }

    // Submit logic
    // Return:
    //  null: invalid group
    //  { ok: false }: count mismatch
    //  { ok: true, done: boolean }: correct, remote done?
    public submitConnect(groupId: string): { ok: boolean; done?: boolean } | null {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return null;

        if (this.connectedIds.has(groupId)) return null; // already connected

        if (group.count === this.targetCount) {
            this.connectedIds.add(groupId);
            this.connectedTargets++;
            const done = this.connectedTargets >= this.totalTargets;
            return { ok: true, done };
        }

        return { ok: false };
    }

    public isConnected(groupId: string): boolean {
        return this.connectedIds.has(groupId);
    }
}
