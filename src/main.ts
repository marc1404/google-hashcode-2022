import fs from 'fs-extra';
import os from 'os';

class Contributor {
    constructor(
        public readonly name: string,
        public readonly skillCount: number,
        public readonly skills: Record<string, Skill> = {},
        public assignment?: Project,
    ) {}

    public hasSkill(expectedSkill: Skill): boolean {
        const actualSkill = this.getSkill(expectedSkill);

        return actualSkill.level >= expectedSkill.level;
    }

    public assign(project: Project): void {
        this.assignment = project;
    }

    public freeFrom(role: Role): void {
        if (!this.assignment) {
            return;
        }

        console.log(`Contributor ${this.name} freed from ${this.assignment.name}`)

        this.assignment = undefined;
        const skill = this.getSkill(role.skill);

        if (skill.level <= role.skill.level) {
            skill.level++;

            console.log(`Contributor ${this.name} levelled up skill ${skill.name} to level ${skill.level}`);
        }
    }

    private getSkill(expectedSkill: Skill): Skill {
        let actualSkill = this.skills[expectedSkill.name];

        if (!actualSkill) {
            actualSkill = new Skill(expectedSkill.name, 0);
            this.skills[actualSkill.name] = actualSkill;
        }

        return actualSkill;
    }
}

class Skill {
    constructor(
        public readonly name: string,
        public level: number,
    ) {}
}

class Project {
    constructor(
        public readonly name: string,
        public duration: number,
        public readonly score: number,
        public readonly bestBefore: number,
        public readonly roleCount: number,
        public readonly roles: Role[] = [],
        public isActive: boolean = false,
        public isCompleted: boolean = false,
        public startDay?: number,
        private readonly mentorSkills: Record<string, number> = {}
    ) {}

    public isFullyAssigned(): boolean {
        for (const role of this.roles) {
            if (!role.isAssigned()) {
                return false;
            }
        }

        return true;
    }

    public tryAssign(contributor: Contributor): boolean {
        for (const role of this.roles) {
            if (role.tryAssign(contributor, this.hasMentorFor(role))) {
                for (const skill of Object.values(contributor.skills)) {
                    this.addMentorSkill(skill);
                }

                return true;
            }
        }

        return false;
    }

    public progress(): void {
        this.duration--;

        if (this.duration > 0) {
            return;
        }

        this.isActive = false;
        this.isCompleted = true;

        console.log(`Project ${this.name} completed`)

        for (const role of this.roles) {
            role.contributor?.freeFrom(role);
        }
    }

    public getCurrentScore(day: number): number {
        const penalty = Math.abs(Math.min(this.bestBefore - day, 0));

        return this.score - penalty;
    }

    private addMentorSkill(skill: Skill): void {
        const level = this.mentorSkills[skill.name] ?? 0;
        this.mentorSkills[skill.name] = Math.max(level, skill.level);
    }

    private hasMentorFor(role: Role): boolean {
        const level = this.mentorSkills[role.skill.name] ?? -1;

        return level >= role.skill.level;
    }
}

class Role {
    constructor(
        public readonly project: Project,
        public readonly skill: Skill,
        public contributor?: Contributor,
    ) {}

    public tryAssign(contributor: Contributor, hasMentor: boolean): boolean {
        if (!contributor.hasSkill(this.skill) && !hasMentor) {
            return false;
        }

        this.contributor = contributor;

        contributor.assign(this.project);

        return true;
    }

    public isAssigned(): boolean {
        return !!this.contributor;
    }
}

main()
    .then(() => console.log('Done!'))
    .catch(error => console.error(error));

async function main() {
    const file = process.argv[2];
    const [contributors, projects] = await parseInput(file);

    projects.sort((a, b) => a.bestBefore - b.bestBefore);

    for (let day = 0; day < Number.MAX_VALUE; day++) {
        console.log(`Start day ${day}`);

        for (const contributor of contributors) {
            if (contributor.assignment) {
                continue;
            }

            for (const project of projects) {
                if (project.isActive || project.isCompleted) {
                    continue;
                }

                if (project.tryAssign(contributor)) {
                    console.log(`Contributor ${contributor.name} assigned to project ${project.name}`);

                    if (project.isFullyAssigned()) {
                        project.isActive = true;
                        project.startDay = day;

                        console.log(`Project ${project.name} started on day ${day}`);
                    }

                    break;
                }
            }
        }

        let allCompleted = true;

        for (const project of projects) {
            const currentScore = project.getCurrentScore(day);

            if (!project.isCompleted && currentScore > 0) {
                allCompleted = false;
            }

            if (!project.isActive || project.isCompleted) {
                continue;
            }

            project.progress();
            console.log(`Project ${project.name} progressed on ${day}`);
        }

        if (allCompleted) {
            break;
        }

        console.log(`End day ${day}`);
    }

    const completedProjects = projects
        .filter(project => project.isCompleted)
        .sort((a, b) => (a.startDay as number) - (b.startDay as number));

    const lines = [
        `${completedProjects.length}`
    ];

    for (const project of completedProjects) {
        lines.push(project.name);
        lines.push(project.roles.map(role => role.contributor?.name).join(' '));
    }

    await fs.writeFile(`./output/${file}`, lines.join(os.EOL), { encoding: "utf8" });
}

async function parseInput(file: string): Promise<[Contributor[], Project[]]> {
    const input = await fs.readFile(`./input/${file}`, { encoding: "utf8" });
    const lines = input.split(os.EOL);
    const header = lines[0];
    const headerParts = header.split(' ');
    const contributorCount = Number.parseInt(headerParts[0], 10);
    const contributors: Contributor[] = [];
    const projects: Project[] = [];
    let mode = 'contributor';

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line === '') {
            break;
        }

        if (mode === 'contributor') {
            const contributor = parseContributor(line)

            for (let j = 0; j < contributor.skillCount; j++) {
                const skill = parseSkill(lines[i + j + 1]);
                contributor.skills[skill.name] = skill;
            }

            i += contributor.skillCount;

            contributors.push(contributor);

            if (contributors.length === contributorCount) {
                mode = 'project';
                continue;
            }
        }

        if (mode === 'project') {
            const project = parseProject(line);

            for (let j = 0; j < project.roleCount; j++) {
                const skill = parseSkill(lines[i + j + 1]);
                const role = new Role(project, skill);

                project.roles.push(role);
            }

            i += project.roleCount;

            projects.push(project);
        }
    }

    return [
        contributors,
        projects
    ];
}

function parseContributor(line: string): Contributor {
    const parts = line.split(' ');
    const contributorName = parts[0];
    const skillCount = Number.parseInt(parts[1], 10);
    const contributor = new Contributor(contributorName, skillCount);

    return contributor;
}

function parseSkill(line: string): Skill {
    const parts = line.split(' ');
    const name = parts[0];
    const level = Number.parseInt(parts[1], 10);
    const skill = new Skill(name, level);

    return skill;
}

function parseProject(line: string): Project {
    const parts = line.split(' ');
    const name = parts[0];
    const duration = Number.parseInt(parts[1], 10);
    const score = Number.parseInt(parts[2], 10);
    const bestBefore = Number.parseInt(parts[3], 10);
    const roleCount = Number.parseInt(parts[4], 10);
    const project = new Project(name, duration, score, bestBefore, roleCount);

    return project;
}
