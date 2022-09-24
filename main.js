const core = require('@actions/core')
const github = require('@actions/github')

async function main() {
    try {
        const token = core.getInput("github_token", { required: true })
        const numbers = core.getInput("numbers")
        const owner = core.getInput("owner")
        const repository = core.getInput("repository")
        const branches = core.getInput("branches")
        const prefix = core.getInput("prefix")
        const suffix = core.getInput("suffix")
        const dryRun = core.getInput("dry_run")
        const days = core.getInput("days")

        const client = github.getOctokit(token)
        const repoName = github.context.payload.repository.name;
        const ownerName = github.context.payload.repository.owner.name;

        let branchesToDelete = branches ? branches.split(",") : []
        let dateThreshold = new Date();

        if (days) {
            dateThreshold.setDate(dateThreshold.getDate() - days);
            console.log("Branches with commits older than " + dateThreshold.toString() + " will be deleted.");
        }

        if (numbers) {
            for (const number of numbers.split(",")) {
                const pull = await client.pulls.get({
                    ...github.context.repo,
                    pull_number: number
                })
                branchesToDelete.push(pull.data.head.ref)
            }
        }

        let ownerOfRepository = owner ? owner : github.context.repo.owner
        let repositoryContainingBranches = repository ? repository : github.context.repo.repo

        for (let branch of branchesToDelete) {
            if (prefix)
                branch = prefix + branch

            if (suffix)
                branch = branch + suffix

            let canDelete = true;
            if (days) {
                await client.request("GET /repos/{owner}/{repo}/branches/{branch}", {
                    owner: ownerName,
                    repo: repoName,
                    branch: branch
                })
                .then((ghBranch) => {
                    let branchLastCommitDate = new Date(ghBranch.data.commit.commit.committer.date);
                    if (branchLastCommitDate > dateThreshold) {
                        console.log("Branch \"" + branch + "\" last commit date is " + branchLastCommitDate.toString() + ". It does not meet the threshold and will not be deleted.");
                        canDelete = false;
                    }
                });
            }

            if (!canDelete)
                continue;

            console.log("==> Deleting \"" + ownerOfRepository + "/" + repositoryContainingBranches + "/" + branch + "\" branch")

            if (!dryRun) {
                try {
                    await client.git.deleteRef({
                        owner: ownerOfRepository,
                        repo: repositoryContainingBranches,
                        ref: "heads/" + branch
                    })
                } catch (error) {
                    const shouldFailSoftly = (soft_fail === 'true');

                    if(shouldFailSoftly)
                        core.warning(error.message)
                    else
                        core.setFailed(error.message)
                }
            }
        }
        console.log("Ending the branch deletion...");
    } catch (error) {
        core.setFailed(error.message)
    }
}

main()
