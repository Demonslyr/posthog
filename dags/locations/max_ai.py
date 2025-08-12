import dagster
from dagster_docker import PipesDockerClient

from dags.max_ai.compile_evals_db import run_evaluation

from . import resources

defs = dagster.Definitions(
    jobs=[run_evaluation],
    resources={
        **resources,
        "docker_pipes_client": PipesDockerClient(),
    },
)
