export interface ConnectGroupDef {
    id: string;
    label: string;
    count: number;
}

export class ConnectSixFlow {
    private groups: ConnectGroupDef[];
    private targetCount: number;
    private connected = new Set<string>();

    constructor(groups: ConnectGroupDef[], targetCount: number = 6) {
        this.groups = groups;
        this.targetCount = targetCount;
    }

    get totalTargets(): number {
        return this.groups.filter(g => g.count === this.targetCount).length;
    }

    get connectedTargets(): number {
        return this.connected.size;
    }

    isConnected(id: string): boolean {
        return this.connected.has(id);
    }

    submitConnect(id: string): { ok: boolean; done: boolean } | null {
        const group = this.groups.find(g => g.id === id);
        if (!group) return null;

        if (group.count === this.targetCount) {
            this.connected.add(id);
            return {
                ok: true,
                done: this.connected.size === this.totalTargets
            };
        }

        return { ok: false, done: false };
    }
}
