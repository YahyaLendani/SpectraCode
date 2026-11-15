"""The bundled sample repo must only be chosen by its exact identifier.

Regression: the import and evaluation routes used to treat any URL containing the
substring "sample" (e.g. github.com/acme/sample-app) as the bundled demo repository.
"""
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.routes import repositories as repo_routes
from app.db.session import init_db
from app.ingestion.git_importer import SAMPLE_REPO_ID, is_sample_identifier
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.parametrize("value", ["sample:fastapi", " SAMPLE:FastAPI "])
def test_exact_sample_identifier_matches(value):
    assert is_sample_identifier(value)


@pytest.mark.parametrize(
    "value",
    [
        "https://github.com/acme/sample-app",
        "acme/samples",
        "sample/fastapi",
        "sample:fastapi-extra",
        "",
    ],
)
def test_other_inputs_are_not_the_sample(value):
    assert not is_sample_identifier(value)


@pytest.mark.asyncio
async def test_import_real_repo_with_sample_in_name_is_not_the_sample(monkeypatch):
    queued = []

    async def fake_indexing(repo_id):  # never clone from the network in tests
        queued.append(repo_id)

    monkeypatch.setattr(repo_routes, "run_indexing_task", fake_indexing)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/repositories/import",
            json={"repository_url": "https://github.com/acme/sample-app"},
        )

    assert resp.status_code == 202, resp.text
    data = resp.json()
    assert data["github_owner"] == "acme"
    assert data["github_name"] == "sample-app"
    assert data["clone_url"] != SAMPLE_REPO_ID
    assert len(queued) == 1
